// Artikel löschen (Betreiberentscheidungen 2026-10-30, Canonical v2.91 G1/G2) — Ansichtslogik des Löschdialogs und
// Quelltextanker der Einbindung in der Artikelliste, der Historienansichten und der Demo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOESCH_TEXT, einheiten, loeschAnsicht, loeschBestaetigung, loeschErfolgText, loeschFehler,
} from "./productDeleteView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PRUEFUNG = (o = {}) => ({
  product: { id: "41", sku: "VT-100", name: "Ventil 100" },
  state: "free",
  warehouses: [
    { warehouseId: "10", warehouseName: "Hauptlager", onHand: 0, reserved: 0, blocked: 0 },
    { warehouseId: "11", warehouseName: "Außenlager", onHand: 0, reserved: 0, blocked: 0 },
  ],
  onHand: 0, reserved: 0, blocked: 0, orders: [], shipments: 0,
  ...o,
});

test("1 — Zustände des Servers: frei und Bestand löschbar, reserviert und gesperrt nie", () => {
  assert.equal(loeschAnsicht(PRUEFUNG()).art, "frei");
  assert.equal(loeschAnsicht(PRUEFUNG()).loeschbar, true);
  const bestand = loeschAnsicht(PRUEFUNG({
    state: "stock", onHand: 8,
    warehouses: [{ warehouseId: "10", warehouseName: "Hauptlager", onHand: 5, reserved: 0, blocked: 0 },
      { warehouseId: "11", warehouseName: "Außenlager", onHand: 3, reserved: 0, blocked: 0 }],
  }));
  assert.equal(bestand.art, "bestand");
  assert.equal(bestand.loeschbar, true);
  assert.deepEqual(bestand.lagerMitBestand.map((l) => [l.warehouseId, l.name, l.bestand]), [["10", "Hauptlager", 5], ["11", "Außenlager", 3]]);
  for (const [state, art] of [["in_use", "reserviert"], ["blocked", "gesperrt"]]) {
    const a = loeschAnsicht(PRUEFUNG({ state }));
    assert.equal(a.art, art);
    assert.equal(a.loeschbar, false, `${state} darf nicht löschbar sein`);
  }
});

test("2 — unbekannte oder unvollständige Prüfung: Fehler, nie geraten", () => {
  for (const d of [null, undefined, {}, { state: "free" }, PRUEFUNG({ state: "deleted" }), PRUEFUNG({ product: null })]) {
    assert.equal(loeschAnsicht(d).art, "fehler", JSON.stringify(d));
  }
});

test("3 — Bestätigung: genau die angezeigten Mengen je Lager, nur bei Bestand", () => {
  const bestand = loeschAnsicht(PRUEFUNG({
    state: "stock", onHand: 5,
    warehouses: [{ warehouseId: "10", warehouseName: "Hauptlager", onHand: 5, reserved: 0, blocked: 0 },
      { warehouseId: "11", warehouseName: "Außenlager", onHand: 0, reserved: 0, blocked: 0 }],
  }));
  assert.deepEqual(loeschBestaetigung(bestand), { writeOff: [{ warehouseId: "10", onHand: 5 }] });
  assert.equal(loeschBestaetigung(loeschAnsicht(PRUEFUNG())), null, "ohne Bestand keine Ausbuchung");
  assert.equal(loeschBestaetigung(loeschAnsicht(PRUEFUNG({ state: "in_use" }))), null);
});

test("4 — reservierende Aufträge mit Nummer und Menge; gesperrte Lager mit Menge", () => {
  const r = loeschAnsicht(PRUEFUNG({ state: "in_use", reserved: 4, orders: [{ orderId: "7", orderNumber: "CE-AU26-01003", quantity: 4 }], shipments: 1 }));
  assert.deepEqual(r.auftraege, [{ orderId: "7", nummer: "CE-AU26-01003", menge: 4 }]);
  assert.equal(r.sendungen, 1);
  const g = loeschAnsicht(PRUEFUNG({ state: "blocked", blocked: 2,
    warehouses: [{ warehouseId: "10", warehouseName: "Hauptlager", onHand: 5, reserved: 0, blocked: 2 }] }));
  assert.deepEqual(g.lagerGesperrt.map((l) => [l.name, l.gesperrt]), [["Hauptlager", 2]]);
});

test("5 — Erfolgsmeldung nennt den Artikel und die ausgebuchte Menge", () => {
  assert.equal(loeschErfolgText({ deleted: { name: "Ventil 100" }, writtenOff: [] }), "Artikel „Ventil 100“ gelöscht.");
  assert.equal(loeschErfolgText({ deleted: { name: "Ventil 100" }, writtenOff: [{ quantity: 5 }, { quantity: 3 }] }),
    "Artikel „Ventil 100“ gelöscht. 8 Einheiten ausgebucht.");
  assert.equal(loeschErfolgText({ deleted: { name: "X" }, writtenOff: [{ quantity: 1 }] }), "Artikel „X“ gelöscht. 1 Einheit ausgebucht.");
  assert.equal(einheiten(1200), "1.200 Einheiten");
});

test("6 — Fehler: bereits gelöscht nur mit dem Code des Artikels; Zustandswechsel → neu prüfen; nie ein Rohtext", () => {
  assert.equal(loeschFehler(404, { code: "PRODUCT_NOT_FOUND" }).art, "geloescht");
  // Ein 404 ohne den Artikelcode (z. B. ein Server ohne die Route) ist KEIN „bereits gelöscht“ — und kein Rohtext.
  assert.deepEqual(loeschFehler(404, { error: "Not found" }), { art: "meldung", text: LOESCH_TEXT.fehlgeschlagen });
  assert.deepEqual(loeschFehler(404, null), { art: "meldung", text: LOESCH_TEXT.fehlgeschlagen });
  for (const code of ["STOCK_CHANGED", "PRODUCT_HAS_STOCK", "PRODUCT_IN_USE", "PRODUCT_STOCK_BLOCKED"]) {
    assert.equal(loeschFehler(409, { code }).art, "neu_pruefen", code);
  }
  assert.equal(loeschFehler(409, { code: "PRODUCT_BUSY" }).text, "Der Artikel wird gerade von einem anderen Vorgang verwendet. Bitte versuchen Sie es gleich noch einmal.");
  assert.deepEqual(loeschFehler(500, { error: "Artikel konnte nicht gelöscht werden", code: "PRODUCT_DELETE_FAILED" }),
    { art: "meldung", text: LOESCH_TEXT.fehlgeschlagen });
  // Demo: „In der Demo nicht verfügbar.“ bleibt eine Meldung, nie ein Erfolg.
  assert.deepEqual(loeschFehler(409, { error: "In der Demo nicht verfügbar.", code: "DEMO_NOT_AVAILABLE" }),
    { art: "meldung", text: "In der Demo nicht verfügbar." });
});

test("7 — Artikelliste: „Löschen“ als dritte, leise Textaktion in Tabelle und Karten; Dialog je Artikel neu geprüft", () => {
  const code = ohneKommentare(lies("../pages/inventory/ProductsPage.jsx"));
  // Sichtbar „Löschen“, Name „Löschen: <Artikel>“ — beginnt mit dem sichtbaren Wort (WCAG 2.5.3).
  const loeschen = code.match(/<button type="button" className="btn btn-sm btn-ghost inv-aktion-loeschen" aria-label=\{`Löschen: \$\{p\.name\}`\}\s+onClick=\{\(\) => setDeleteTarget\(p\)\}>Löschen<\/button>/g) || [];
  assert.equal(loeschen.length, 2, "in Tabelle und Kartenansicht");
  // Reihenfolge je Ansicht: Bearbeiten · Versenden · Löschen.
  for (const start of [code.indexOf('<div className="inv-row-actions">'), code.indexOf('<div className="inv-card-actions">')]) {
    assert.ok(start > 0, "Aktionsbündel gefunden");
    const block = code.slice(start, code.indexOf("</div>", start));
    const pos = ["Bearbeiten", "Versenden", "Löschen"].map((w) => block.indexOf(w));
    assert.ok(pos.every((p) => p > 0) && pos[0] < pos[1] && pos[1] < pos[2], `Reihenfolge: ${pos}`);
  }
  // Tabelle: nebeneinander ab 63rem (gemessene Mindestbreite 61.25rem), darunter untereinander — nie „2 + 1“.
  const css = lies("../styles/premium-editorial.css");
  assert.match(css, /:root\[data-ce-bereich="kunde"\] \.inv-list-table--artikel \.inv-row-actions \{ flex-wrap: nowrap; \}/);
  assert.match(css, /@container ce-seite \(width < 63rem\) \{\s*:root\[data-ce-bereich="kunde"\] \.inv-list-table--artikel \.inv-row-actions \{ flex-direction: column; align-items: flex-end;/);
  assert.match(code, /<ProductDeleteDialog\s+key=\{deleteTarget\.id\}\s+product=\{deleteTarget\}/);
  assert.match(code, /onDeleted=\{\(\{ text \}\) => \{ setDeleteTarget\(null\); zeigeErfolg\(text\); load\(null\); \}\}/);
});

test("8 — Dialog: erst prüfen, Bestand nur mit Häkchen, gesperrt während des Löschens, Fehler nie als Erfolg", () => {
  const code = ohneKommentare(lies("../components/inventory/ProductDeleteDialog.jsx"));
  assert.match(code, /await getProductDeletionCheck\(product\.id\)/);
  assert.match(code, /const kannLoeschen = Boolean\(a && a\.loeschbar\) && \(!mitBestand \|\| ausbuchen\) && !busy;/);
  assert.match(code, /await deleteProduct\(product\.id, loeschBestaetigung\(a\)\)/);
  assert.match(code, /if \(res\.ok\) \{ onDeleted\(\{ text: loeschErfolgText\(body\) \}\); return; \}/);
  assert.match(code, /className="btn btn-danger inv-loeschen-bestaetigen" onClick=\{loeschen\} disabled=\{!kannLoeschen\}/);
  assert.match(code, /<input type="checkbox" checked=\{ausbuchen\} disabled=\{busy\}/);
  assert.match(code, /busy=\{busy\}/, "Escape und Schließen während des Löschens gesperrt");
  // Reserviert: Weg zum Auftrag; gesperrt: zur Artikelseite (dort „Sperre aufheben“).
  assert.match(code, /gehe\(`\/inventory\/orders\/\$\{o\.orderId\}`\)/);
  assert.match(code, /gehe\(`\/inventory\/products\/\$\{a\.produkt\.id\}`\)/);
});

test("9 — Historie: gelöschte Artikel ohne Link; Grund „Artikel gelöscht“ nur als Anzeige, nie wählbar", async () => {
  const auftrag = ohneKommentare(lies("../pages/inventory/OrderDetailPage.jsx"));
  assert.equal((auftrag.match(/<ProductRef productId=\{it\.productId\} name=\{it\.name\}/g) || []).length, 2);
  assert.doesNotMatch(auftrag, /navigate\(`\/inventory\/products\/\$\{it\.productId\}`\)/);
  const { adjustmentReasonLabel, ADJUSTMENT_REASONS } = await import("./inventoryStockView.mjs");
  assert.equal(adjustmentReasonLabel("product_deleted"), "Artikel gelöscht");
  assert.ok(!ADJUSTMENT_REASONS.some((r) => r.value === "product_deleted"), "nie in der Korrekturauswahl");
  assert.equal(adjustmentReasonLabel("erfunden"), null);
  assert.match(lies("../pages/admin/AuditLogPage.jsx"), /"product\.delete": "Artikel gelöscht \(Kunde\)"/);
});

test("10 — Demo: Prüfung aus den Beispieldaten, Löschen „In der Demo nicht verfügbar.“", async () => {
  const demo = lies("../demo/demoBackend.mjs");
  assert.match(demo, /pfad\.match\(\/\^\\\/api\\\/kunde\\\/products\\\/\(\\d\+\)\\\/deletion-check\$\/\)/);
  // Jede Nicht-GET-Anfrage an einen Demo-Artikel bleibt „nicht verfügbar“ (auch DELETE).
  assert.match(demo, /if \(methode !== "GET"\) return nichtVerfuegbar\(\);/);
});
