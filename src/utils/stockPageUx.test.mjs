// Bestandsseite und Kennzahlenausrichtung.
//
// Zwei Themen, ein Test:
//
//   1. Die Vorschauen der Bestandsvorgänge. Sie sind reine DARSTELLUNG — sie
//      sagen dem Kunden, was sein eingetippter Wert bedeutet. Gebucht wird
//      ausschließlich, was der Server aus dem tatsächlich gespeicherten Bestand
//      ableitet. Deshalb prüfen die Tests hier auch das, was NICHT passiert:
//      kein selbst gerechnetes Delta im Request, keine Vorschau ohne belastbare
//      Grundlage.
//
//   2. Die Ausrichtung der Bestandskennzahlen. `.ce-num` markiert laut
//      primitives.css eine numerische TABELLENSPALTE und bringt
//      `text-align: right` mit. Auf einem frei stehenden Element in einer
//      Karte richtete es jeden Wert an der rechten Kante seiner Zelle aus,
//      während die Beschriftung links stand — gemessen 81 bis 194 px Versatz,
//      abhängig von der Fensterbreite. Test D1 hält fest, dass die Klasse dort
//      nicht zurückkehrt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADJUSTMENT_REASONS, adjustmentPreview, adjustmentReasonLabel,
  lowStockInfo, receiptPreview,
} from "./inventoryView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const stockPage = lies("../pages/inventory/StockPage.jsx");
const detailPage = lies("../pages/inventory/ProductDetailPage.jsx");
const movementsPage = lies("../pages/inventory/MovementsPage.jsx");
const shared = lies("../components/inventory/InventoryShared.jsx");
const css = lies("../styles/inventory.css");
const icon = lies("../components/ui/Icon.jsx");
const adressMenu = lies("../components/addressbook/AddressActionsMenu.jsx");
const entwurfMenu = lies("../components/drafts/DraftActionsMenu.jsx");

/* Jede „darf NICHT vorkommen"-Prüfung läuft am kommentarfreien Quelltext.
   Sonst schlägt sie an, sobald ein Kommentar die abgelöste Fassung ERKLÄRT —
   und genau das tun die Kommentare hier durchgehend. Ein Test, den man durch
   Streichen einer Begründung grün bekommt, prüft nicht mehr das Verhalten. */
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const stockCode = ohneKommentare(stockPage);
const detailCode = ohneKommentare(detailPage);

/* ══════════ A — Wareneingangsvorschau ══════════════════════════════════════ */

test("A1 Vorschau addiert zum vorhandenen Bestand", () => {
  assert.deepEqual(receiptPreview({ onHand: 12 }, "16"), { current: 12, quantity: 16, next: 28 });
  assert.deepEqual(receiptPreview({ stock: { onHand: 5 } }, 3), { current: 5, quantity: 3, next: 8 });
});

test("A2 ohne verwertbare Menge gibt es keine Vorschau", () => {
  for (const eingabe of ["", "   ", "abc", "2,5", "2.5", "0", "-3", null, undefined]) {
    assert.equal(receiptPreview({ onHand: 12 }, eingabe), null, String(eingabe));
  }
});

test("A3 ohne bekannten Ausgangsbestand gibt es keine Vorschau", () => {
  // Lieber gar keine Zahl als eine, die auf einem geratenen Stand beruht.
  assert.equal(receiptPreview(null, "5"), null);
  assert.equal(receiptPreview({}, "5"), null);
  assert.equal(receiptPreview({ onHand: null }, "5"), null);
});

/* ══════════ B — Korrekturvorschau ══════════════════════════════════════════ */

test("B1 gespeichert 30, gezählt 28 → Differenz −2, neuer Bestand 28", () => {
  assert.deepEqual(adjustmentPreview({ onHand: 30 }, "28"), {
    stored: 30, counted: 28, difference: -2, next: 28, unchanged: false,
  });
});

test("B2 gezählt über dem gespeicherten Stand ergibt eine positive Differenz", () => {
  const v = adjustmentPreview({ onHand: 30 }, "33");
  assert.equal(v.difference, 3);
  assert.equal(v.next, 33);
});

test("B3 gleiche Zahl ist kein Fehler, sondern ausdrücklich „unverändert“", () => {
  const v = adjustmentPreview({ onHand: 30 }, "30");
  assert.equal(v.difference, 0);
  assert.equal(v.unchanged, true);
});

test("B4 null ist ein gültiger gezählter Bestand — das Regal kann leer sein", () => {
  const v = adjustmentPreview({ onHand: 4 }, "0");
  assert.equal(v.counted, 0);
  assert.equal(v.difference, -4);
});

test("B5 der neue Bestand IST der gezählte Wert", () => {
  // Der Sinn einer Zählung: nicht das Delta ist die Aussage, sondern der Ist-Stand.
  for (const [stand, zaehlung] of [[30, 28], [0, 7], [9, 9]]) {
    assert.equal(adjustmentPreview({ onHand: stand }, String(zaehlung)).next, zaehlung);
  }
});

test("B6 ungültige oder negative Eingaben ergeben keine Vorschau", () => {
  for (const eingabe of ["", "abc", "-1", "1.5", null, undefined]) {
    assert.equal(adjustmentPreview({ onHand: 30 }, eingabe), null, String(eingabe));
  }
});

/* ══════════ C — Der Client rechnet keine Datenbankwahrheit ═════════════════ */

test("C1 die Korrektur sendet den GEZÄHLTEN Wert, nie ein Delta", () => {
  assert.match(stockPage, /countedQuantity: n/, "countedQuantity fehlt im Request");
  assert.doesNotMatch(stockCode, /\bdelta:/, "die Seite darf kein Delta senden");
});

test("C2 keine Vorschauzahl wandert in einen Request", () => {
  // Die Vorschauobjekte dürfen ausschließlich angezeigt werden.
  const requestBloecke = stockCode.match(/post(Receipt|Adjustment|Block|Unblock)\(\{[^}]*\}/g) || [];
  assert.ok(requestBloecke.length >= 4, "nicht alle vier Vorgänge gefunden");
  for (const b of requestBloecke) {
    assert.doesNotMatch(b, /Vorschau|preview|\.next|\.difference/, `Vorschauwert im Request: ${b}`);
  }
});

test("C3 die Vorschau erscheint nur bei belastbarer Grundlage", () => {
  // Die Artikelsuche liefert die SUMME über alle Lager (routes/products.js:
  // SUM(b.on_hand)) — bei mehreren Lagern wäre sie als Ausgangsbestand falsch.
  assert.match(stockPage, /warehouses\.length <= 1/, "Mehrlagerfall nicht abgesichert");
  assert.match(stockPage, /String\(picked\.warehouseId\) === String\(warehouseId\)/,
    "die Vorschau muss zum GEWÄHLTEN Lager gehören");
});

/* ══════════ D — Ausrichtung der Kennzahlen ════════════════════════════════ */

test("D1 Beschriftung-über-Wert trägt kein .ce-num", () => {
  // .ce-num ist der Marker einer numerischen Tabellenspalte (text-align: right).
  // In einer Karte steht der Wert UNTER seiner Beschriftung — beide linksbündig.
  const treffer = [
    ...detailPage.matchAll(/className=\{?["`][^"`]*inv-detail-v[^"`]*["`]/g),
    ...stockPage.matchAll(/<dd className="[^"]*ce-num[^"]*"/g),
    ...shared.matchAll(/className="inv-stat-value[^"]*"/g),
  ].map((m) => m[0]).filter((s) => s.includes("ce-num"));
  assert.deepEqual(treffer, [], `.ce-num außerhalb einer Tabellenspalte: ${treffer.join(" · ")}`);
});

test("D2 die Zahlen bleiben tabellarisch, obwohl .ce-num entfällt", () => {
  for (const regel of [".inv-detail-v", ".inv-card-facts dd", ".inv-dialog-facts dd"]) {
    const block = css.slice(css.indexOf(regel + " {") >= 0 ? css.indexOf(regel + " {") : css.indexOf(regel));
    const ende = block.indexOf("}");
    assert.match(block.slice(0, ende), /tabular-nums/, `${regel} verliert die Ziffernbreite`);
  }
});

test("D3 alle Kennzahlen teilen sich EINE Zeilenspur — kein Ausgleich je Kennzahl", () => {
  assert.match(css, /@supports \(grid-template-rows: subgrid\)/, "gemeinsames Raster fehlt");
  assert.match(css, /\.inv-detail-stock > div \{ display: grid; grid-template-rows: subgrid; grid-row: span 2;/);
  // Kein Pixel-Hack auf einzelne Kennzahlen.
  assert.doesNotMatch(css, /\.inv-detail-stock[^{}]*:nth-child\([^)]*\)\s*\{[^}]*margin/,
    "Ausgleich je einzelner Kennzahl");
});

test("D4 die Werte bleiben in einer Zeile", () => {
  const i = css.indexOf(".inv-detail-v {");
  assert.ok(i > 0);
  assert.match(css.slice(i, css.indexOf("}", i)), /white-space: nowrap/);
});

/* ══════════ E — Bestandsseite ═════════════════════════════════════════════ */

test("E1 die Mengenspalte heißt „Physisch“ — wie auf der Artikeldetailseite", () => {
  assert.match(stockPage, /<th scope="col" className="ce-num">Physisch<\/th>/);
  assert.match(stockPage, /<div><dt>Physisch<\/dt>/);
  assert.doesNotMatch(stockCode, /<th scope="col" className="ce-num">Bestand<\/th>/);
});

test("E2 der Artikelname führt zum Artikel", () => {
  const links = stockPage.match(/navigate\(`\/inventory\/products\/\$\{b\.productId\}`\)/g) || [];
  assert.equal(links.length, 2, "Tabelle UND Karte brauchen den Link");
});

test("E3 Sperren und Sperre verwalten hängen am gesperrten Bestand", () => {
  assert.match(stockPage, /Number\(b\.blocked \?\? 0\) > 0/);
  assert.match(stockPage, /label: "Sperre verwalten"/);
  assert.match(stockPage, /label: "Bestand sperren"/);
  // Ohne verfügbaren Bestand gibt es nichts zu sperren.
  assert.match(stockPage, /disabled: Number\(b\.available \?\? 0\) < 1/);
});

test("E3b beide Sperraktionen sind aus der ZEILE erreichbar, nicht nur global", () => {
  // Sie stehen im Zeilenmenü, weil drei Knöpfe nebeneinander (336 px) nie in
  // die Aktionsspalte passten (271 px selbst auf 1920 px) — erreichbar bleiben
  // sie damit trotzdem direkt an der Zeile.
  assert.match(stockPage, /<RowActionsMenu/);
  const menu = stockPage.slice(stockPage.indexOf("<RowActionsMenu"), stockPage.indexOf("</>", stockPage.indexOf("<RowActionsMenu")));
  for (const eintrag of ["Bestand korrigieren", "Sperre verwalten", "Bestand sperren"]) {
    assert.ok(menu.includes(eintrag), `${eintrag} fehlt im Zeilenmenü`);
  }
  // Die häufigste Aktion bleibt direkt sichtbar.
  assert.match(stockPage, /className="btn btn-sm btn-outline" onClick=\{\(\) => oeffne\("receipt", ausZeile\(b\)\)\}>Einbuchen</);
});

test("E3c das Zeilenmenü gibt den Fokus ZUERST an seinen Auslöser zurück", () => {
  // Dieselbe Regel wie bei AddressActionsMenu/DraftActionsMenu: löst die Aktion
  // zuerst aus, merkt sich ein daraufhin geöffneter Dialog den Menüeintrag, der
  // mit dem Menü verschwindet — der Fokus landet danach auf <body>.
  const i = shared.indexOf("const fuehreAus");
  assert.ok(i > 0, "RowActionsMenu fehlt");
  const block = shared.slice(i, shared.indexOf("};", i));
  assert.ok(block.indexOf("triggerRef.current?.focus()") < block.indexOf("item.onClick"),
    "Fokusrückgabe muss VOR der Aktion stehen");
  assert.match(shared, /aria-haspopup="menu"/);
  assert.match(shared, /role="menuitem"/);
});

/* ── Zeilenmenü: Inhalt, Icon, deaktivierter Eintrag ───────────────────────── */

test("E3d das Menü hat in BEIDEN Sperrzuständen drei Einträge", () => {
  // Vorher waren es zwei, von denen einer bei verfügbar = 0 deaktiviert war —
  // das Menü wirkte dadurch einträgig und wie eine Wiederholung der Kopfaktion.
  const menu = stockPage.slice(stockPage.indexOf("<RowActionsMenu"), stockPage.indexOf("/>", stockPage.indexOf("<RowActionsMenu")));
  const labels = [...menu.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Bestand korrigieren", "Sperre verwalten", "Bestand sperren", "Bewegungen anzeigen"],
    "erwartet: Korrigieren · (Sperre verwalten | Bestand sperren) · Bewegungen");
  // Die beiden Sperrfassungen schließen einander aus — je Zustand bleiben drei.
  assert.match(menu, /Number\(b\.blocked \?\? 0\) > 0\s*\?[\s\S]*Sperre verwalten[\s\S]*:\s*\{[\s\S]*Bestand sperren/);
});

test("E3e „Bewegungen anzeigen“ öffnet die Bewegungsseite mit Artikelfilter", () => {
  assert.match(stockPage, /onNavigate\("movements", \{ productId: b\.productId \}\)/);
  // Kein behaupteter Lagerfilter: der Endpunkt filtert nur nach Artikel.
  assert.doesNotMatch(stockCode, /Bewegungen dieses Lagers|warehouseId: b\.warehouseId \}\)/);
  assert.doesNotMatch(stockCode, /label: "Bewegungen[^"]*Lager/);
});

test("E3f der deaktivierte Sperreintrag sagt, warum", () => {
  assert.match(stockPage, /disabled: Number\(b\.available \?\? 0\) < 1,\s*\n?\s*disabledReason: "Keine verfügbaren Einheiten"/);
  // Die Begründung steht im Menü selbst — nicht nur in einem title-Attribut,
  // das auf Mobil niemand sieht.
  assert.match(shared, /item\.disabled && item\.disabledReason/);
  assert.match(shared, /className="inv-actions-item-reason"/);
  assert.match(css, /\.inv-actions-item-reason \{/);
});

test("E3g die Begründung erscheint nur im deaktivierten Zustand", () => {
  // Sonst bliebe das Menü dauerhaft aufgebläht.
  const i = shared.indexOf("inv-actions-item-reason");
  const block = shared.slice(Math.max(0, i - 300), i);
  assert.match(block, /item\.disabled &&/, "die Zeile hängt nicht am Disabled-Zustand");
});

test("E3h der Auslöser trägt Drei-Punkte, kein Zahnrad", () => {
  // Ab dem Auslöser suchen: `{open &&` steht schon weiter oben in
  // CollapsibleSection, ein globales indexOf ergäbe einen leeren Ausschnitt —
  // und ein leerer Ausschnitt bestünde jede doesNotMatch-Prüfung.
  const ab = shared.indexOf('aria-haspopup="menu"');
  assert.ok(ab > 0, "Auslöser des Zeilenmenüs nicht gefunden");
  const trigger = shared.slice(ab, shared.indexOf("{open &&", ab));
  assert.match(trigger, /<Icon n="dots"/, "Zahnrad statt Drei-Punkte im Auslöser");
  assert.doesNotMatch(trigger, /n="settings"/);
  // Das Icon kommt aus dem bestehenden System, nicht aus einer neuen Library.
  assert.match(icon, /^\s*dots:/m, "dots fehlt im paths-Objekt von Icon.jsx");
});

test("E3i dieselbe Funktion trägt überall dasselbe Icon", () => {
  // Adressbuch und Entwürfe nutzen dasselbe „Weitere Aktionen"-Konzept.
  for (const [name, quelle] of [["Adressbuch", adressMenu], ["Entwürfe", entwurfMenu]]) {
    assert.match(quelle, /<Icon n="dots" s=\{16\} \/>/, `${name}: Auslöser trägt kein Drei-Punkte-Icon`);
    assert.doesNotMatch(quelle, /n="settings"/, `${name}: Zahnrad noch vorhanden`);
  }
});

test("E3j in Adressbuch und Entwürfen wurde NUR das Icon getauscht", () => {
  // Menüinhalt und Verhalten bleiben unangetastet.
  assert.match(entwurfMenu, /<Icon n="trash" s=\{15\} \/> Löschen/);
  for (const quelle of [adressMenu, entwurfMenu]) {
    assert.match(quelle, /role="menu"/);
    assert.match(quelle, /role="menuitem"/);
    assert.match(quelle, /e\.key === "Escape"/);
    assert.match(quelle, /wrapRef\.current && !wrapRef\.current\.contains\(e\.target\)/);
    assert.match(quelle, /triggerRef\.current\?\.focus\(\)/);
  }
});

test("E3l das Menü kann seinen Container verlassen", () => {
  // `.ce-table-container` trägt `overflow: hidden` — ein absolut positioniertes
  // Menü wurde bei der letzten Tabellenzeile nach dem ERSTEN Eintrag
  // abgeschnitten, und in der Karte lief es auf 390 px bis x = −56 aus dem Bild.
  // Beides ist mit CSS allein nicht lösbar, solange der Container clippt.
  const i = css.indexOf(".inv-actions-menu {");
  assert.ok(i > 0);
  const regel = css.slice(i, css.indexOf("}", i));
  assert.match(regel, /position: fixed/, "ein absolutes Menü kann den Container nicht verlassen");
  assert.doesNotMatch(regel, /position: absolute/);
  // Die Koordinaten kommen aus dem echten Rechteck des Auslösers.
  assert.match(shared, /triggerRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(shared, /style=\{\{ top: pos\.top, left: pos\.left \}\}/);
});

test("E3m das Menü bleibt im Viewport und folgt seiner Zeile", () => {
  const i = shared.indexOf("const platziere");
  assert.ok(i > 0, "Positionierung fehlt");
  const block = shared.slice(i, shared.indexOf("}, []);", i));
  // In den Viewport geklemmt statt blind rechtsbündig.
  assert.match(block, /Math\.min\(Math\.max\(/);
  // Nach oben aufklappen, wenn unten kein Platz ist.
  assert.match(block, /passtUnten \? t\.bottom \+ 6 : Math\.max\(rand, t\.top - 6 - hoehe\)/);
  // Vor dem Zeichnen messen — kein Aufblitzen an falscher Stelle.
  assert.match(shared, /useLayoutEffect\(\(\) => \{ if \(open\) platziere\(\); \}/);
  // Beim Scrollen nachführen statt schließen; Capture erfasst auch Container.
  assert.match(shared, /window\.addEventListener\("scroll", nachfuehren, true\)/);
  assert.match(shared, /window\.addEventListener\("resize", nachfuehren\)/);
});

test("E3k die Ansage nennt Artikel UND Lager", () => {
  // Derselbe Artikel kann in zwei Lagern zweimal in der Liste stehen.
  assert.match(stockPage, /label=\{`Weitere Aktionen für \$\{b\.productName\}, \$\{b\.warehouseName\}`\}/);
});

test("E4 es gibt genau EINE primäre Aktion im Seitenkopf", () => {
  const kopf = stockPage.slice(stockPage.indexOf("<PageHeader"), stockPage.indexOf("<InlineSuccess"));
  const primaer = kopf.match(/btn btn-primary/g) || [];
  assert.equal(primaer.length, 1, "mehr als eine Hauptaktion im Seitenkopf");
  assert.match(kopf, /btn btn-primary[\s\S]{0,120}Bestand einbuchen/);
});

test("E5 die Fehlmenge steht an der Zahl, die sie erklärt", () => {
  assert.match(stockPage, /lowStockInfo\(b\)/, "die vorhandene Ableitung wird nicht wiederverwendet");
  assert.match(stockPage, /inv-cell-shortfall/);
  assert.match(stockPage, /inv-card-shortfall/);
  // Keine zweite Fehlmengenrechnung in der Seite.
  assert.doesNotMatch(stockCode, /minStock\s*-\s*.*available/, "eigene Fehlmengenrechnung in der Seite");
});

test("E6 die Fehlmenge kommt aus lowStockInfo und nur bei gepflegtem Mindestbestand", () => {
  assert.equal(lowStockInfo({ available: 4, minStock: 10 }).missing, 6);
  assert.equal(lowStockInfo({ available: 10, minStock: 10 }), null, "genau der Mindestbestand ist der Sollzustand");
  assert.equal(lowStockInfo({ available: 0, minStock: null }), null, "ohne Sollwert gibt es keine Aussage");
});

test("E7 der Notizplatzhalter verspricht kein Feld, das es nicht gibt", () => {
  // „Inventurgrund" stand als Beispiel im Freitextfeld, obwohl es dafür kein
  // Feld gab — jetzt gibt es eines, und es heißt Korrekturgrund.
  assert.doesNotMatch(stockCode, /Inventurgrund/);
  assert.match(stockPage, /placeholder="z\. B\. Lieferschein-Nr\. oder interne Notiz"/);
});

test("E8 Korrigieren und Sperren werden im Dialog voneinander abgegrenzt", () => {
  assert.match(stockPage, /Eine Korrektur ändert den <strong>physischen<\/strong> Bestand/);
  assert.match(stockPage, /Gesperrte Einheiten bleiben physisch im Lager/);
});

/* ══════════ F — Korrekturgründe ═══════════════════════════════════════════ */

test("F1 vier Gründe, Codes wie im Backend", () => {
  assert.deepEqual(ADJUSTMENT_REASONS.map((r) => r.value), ["stocktake", "damaged", "shrinkage", "other"]);
  assert.deepEqual(ADJUSTMENT_REASONS.map((r) => r.label),
    ["Inventurdifferenz", "Beschädigung", "Schwund", "Sonstiges"]);
});

test("F2 ein unbekannter oder fehlender Code erscheint nie roh", () => {
  assert.equal(adjustmentReasonLabel("stocktake"), "Inventurdifferenz");
  assert.equal(adjustmentReasonLabel("erfunden"), null);
  assert.equal(adjustmentReasonLabel(null), null);
  assert.equal(adjustmentReasonLabel(undefined), null);
});

test("F3 die Ja/Nein-Frage ist durch das Auswahlfeld ersetzt", () => {
  assert.doesNotMatch(stockCode, /Fehlmenge ist Bruch/);
  assert.doesNotMatch(stockCode, /\bdamage\b/, "das alte Feld wird nicht mehr gesendet");
  assert.match(stockPage, /reason: adjustReason/);
  assert.match(stockPage, /Korrekturgrund/);
});

test("F4 der Grund geht als eigenes Feld, nicht im Notiztext", () => {
  const block = stockCode.slice(stockCode.indexOf("postAdjustment("), stockCode.indexOf("postAdjustment(") + 160);
  assert.match(block, /reason: adjustReason/);
  assert.doesNotMatch(block, /note: `/, "der Grund darf nicht in die Notiz geschrieben werden");
});

test("F5 der gespeicherte Grund ist auch sichtbar, nicht nur schreibbar", () => {
  assert.match(movementsPage, /adjustmentReasonLabel\(m\.reason\)/);
  assert.match(detailPage, /adjustmentReasonLabel\(m\.reason\)/);
});

/* ══════════ G — Der doppelte CTA der Artikeldetailseite ═══════════════════ */

test("G1 „Bestand einbuchen“ steht genau einmal je Zustand", () => {
  const abschnitt = detailCode.slice(detailCode.indexOf("inv-detail-stock"), detailCode.indexOf("inv-detail-table"));
  const cta = abschnitt.match(/Bestand einbuchen/g) || [];
  assert.equal(cta.length, 2, "erwartet: einer im Hinweisstreifen, einer in der Aktionszeile");
  // …aber nie beide gleichzeitig: der in der Aktionszeile weicht, sobald der
  // Hinweisstreifen ihn schon als Hauptaktion trägt.
  assert.match(abschnitt, /\{!niedrig && \(\s*<button[^>]*onClick=\{\(\) => oeffneStock\("receipt"\)\}/);
});
