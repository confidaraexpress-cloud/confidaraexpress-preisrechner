/* Lager & Aufträge — reines Anzeigemodell und Prefill-Abbildung.
 *
 * Geprüft wird die Zusage, dass der Lagerbereich den bestehenden Versandprozess
 * nur SPEIST und ihn nicht ersetzt:
 *   · beide Prefill-Wege erzeugen einen gewöhnlichen Werte-Patch auf die
 *     bestehenden Formularfelder — und NIE Paketmaße (kein Bin Packing)
 *   · Bestandswerte werden angezeigt, nie berechnet oder zurückgesendet
 *   · kein roher Backendwert erscheint im sichtbaren Text
 *   · der Lagerbezug im Vorgangsschema ist additiv und wird verworfen statt
 *     halb übernommen
 *
 * Run: node --test src/utils/inventoryView.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  orderStatusView, isOrderShippable, movementTypeView, MOVEMENT_TYPES,
  signedQuantity, formatUnits, formatKg, isLowStock, stockLevelView,
  mapOrderPrefillToShipment, mapProductToShipment, inventoryErrorText,
} from "./inventoryView.mjs";
import { emptyScope, normalizeScope, dropOffers, normalizeInventoryContext } from "./shippingFlowState.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => fs.readFileSync(path.join(hier, rel), "utf8");

/* ══════════ 1 — Status und Bewegungstypen ════════════════════════════════ */

test("1 — bekannte Auftragsstatus haben Text und Badge, unbekannte fallen sauber zurück", () => {
  assert.deepEqual(orderStatusView("open"), ["badge--info", "Offen", null]);
  assert.deepEqual(orderStatusView("shipped"), ["badge--success", "Versendet", null]);
  assert.deepEqual(orderStatusView("cancelled"), ["badge--cancelled", "Storniert", null]);
  // Unbekannter Backendwert: „Unbekannter Status", Rohwert nur fürs title.
  const [cls, text, roh] = orderStatusView("awaiting_pick");
  assert.equal(cls, "badge-gray");
  assert.equal(text, "Unbekannter Status");
  assert.equal(roh, "awaiting_pick");
  assert.deepEqual(orderStatusView(null), ["badge-gray", "—", null]);
});

test("2 — kein Rohwert erscheint je im sichtbaren Text", () => {
  for (const wert of ["open", "shipped", "partially_shipped", "cancelled", "sonstwas", "", null, undefined, 42]) {
    const [, text] = orderStatusView(wert);
    assert.notEqual(text, String(wert), `Rohwert ${wert} steht im sichtbaren Text`);
  }
  for (const wert of [...MOVEMENT_TYPES, "PICK", "", null]) {
    const [, text] = movementTypeView(wert);
    assert.notEqual(text, String(wert), `Rohwert ${wert} steht im sichtbaren Text`);
  }
});

test("3 — alle acht Bewegungstypen tragen einen deutschen Text", () => {
  for (const t of MOVEMENT_TYPES) {
    const [cls, text, roh] = movementTypeView(t);
    assert.equal(roh, null, `${t} fällt fälschlich auf den Fallback`);
    assert.ok(cls.startsWith("badge--"), `${t} hat keine Badgeklasse`);
    assert.ok(text.length > 2 && !/^[A-Z_]+$/.test(text), `${t} zeigt den Rohwert`);
  }
});

test("4 — Versandbereitschaft hängt an Status UND offener Menge", () => {
  assert.equal(isOrderShippable({ status: "open", openQuantity: 5 }), true);
  assert.equal(isOrderShippable({ status: "partially_shipped", openQuantity: 2 }), true);
  // Offen, aber nichts mehr reserviert → nichts zu versenden.
  assert.equal(isOrderShippable({ status: "open", openQuantity: 0 }), false);
  assert.equal(isOrderShippable({ status: "shipped", openQuantity: 0 }), false);
  assert.equal(isOrderShippable({ status: "cancelled", openQuantity: 5 }), false);
  assert.equal(isOrderShippable(null), false);
});

/* ══════════ 2 — Zahlen und Bestand ═══════════════════════════════════════ */

test("5 — Mengen werden formatiert, nie als NaN oder Rohwert gezeigt", () => {
  assert.equal(formatUnits(1234), "1.234");
  assert.equal(formatUnits(0), "0");
  assert.equal(formatUnits(null), "—");
  assert.equal(formatUnits(undefined), "—");
  assert.equal(formatUnits("abc"), "—");
  assert.equal(signedQuantity(5), "+5");
  assert.equal(signedQuantity(-5), "-5");
  assert.equal(signedQuantity("x"), "—");
  assert.equal(formatKg(1.25), "1,25 kg");
  assert.equal(formatKg(null), "—");
});

test("6 — niedriger Bestand nur bei gepflegtem Mindestbestand, und strikt darunter", () => {
  assert.equal(isLowStock({ available: 8, minStock: 10 }), true);
  // Genau der Mindestbestand ist der Sollzustand, nicht der Alarmfall.
  assert.equal(isLowStock({ available: 10, minStock: 10 }), false);
  assert.equal(isLowStock({ available: 0, minStock: 0 }), false);
  // Ohne Mindestbestand gibt es keine Aussage.
  assert.equal(isLowStock({ available: 0, minStock: null }), false);
  assert.equal(isLowStock({ available: 0 }), false);
  assert.equal(stockLevelView({ available: 0 }), null);
  assert.deepEqual(stockLevelView({ available: 8, minStock: 10 }), ["badge--warning", "Niedriger Bestand"]);
});

/* ══════════ 3 — Prefill: Auftrag ═════════════════════════════════════════ */

const AUFTRAG_PREFILL = {
  order: { id: "7", orderNumber: "CE-AU26-00001", customerReference: "REF-1" },
  recipient: {
    company: "Muster GmbH", fullName: "Max Muster", streetAndNumber: "Musterweg 1",
    addressAddition: "Haus 2", postalCode: "10115", city: "Berlin", country: "DE",
    phone: "030 1234", email: "max@example.de",
  },
  warehouseId: "3",
  suggestedWeightKg: 6.25,
  weightComplete: true,
  items: [{ orderItemId: "5", productId: "11", quantity: 5, sku: "A-1", name: "Artikel A" }],
};

test("7 — der Auftrags-Prefill füllt genau die bestehenden Empfängerfelder", () => {
  const p = mapOrderPrefillToShipment(AUFTRAG_PREFILL);
  assert.deepEqual(Object.keys(p.form).sort(), [
    "r_addition", "r_city", "r_company", "r_country", "r_email",
    "r_fullName", "r_phone", "r_street", "r_zip", "weight",
  ]);
  assert.equal(p.form.r_fullName, "Max Muster");
  assert.equal(p.form.r_street, "Musterweg 1");
  assert.equal(p.form.r_zip, "10115");
  assert.equal(p.form.r_country, "DE");
  assert.equal(p.form.weight, "6.25");
});

test("8 — der Prefill gibt NIEMALS Paketmaße oder Paketanzahl vor", () => {
  for (const payload of [mapOrderPrefillToShipment(AUFTRAG_PREFILL),
                         mapProductToShipment({ id: "1", sku: "A", name: "A", weightKg: 2 }, 3)]) {
    for (const feld of ["length", "width", "height", "packageCount"]) {
      assert.ok(!(feld in payload.form), `${feld} darf nicht vorbelegt werden (kein Bin Packing)`);
    }
  }
});

test("9 — ein unvollständiges Warengewicht wird weggelassen statt zu niedrig geschätzt", () => {
  const ohne = mapOrderPrefillToShipment({ ...AUFTRAG_PREFILL, suggestedWeightKg: null, weightComplete: false });
  assert.ok(!("weight" in ohne.form), "ein unsicheres Gewicht darf nicht vorbelegt werden");
  // Und der Rest des Prefills bleibt vollständig nutzbar.
  assert.equal(ohne.form.r_city, "Berlin");
  assert.equal(ohne.inventory.orderId, "7");
});

test("10 — der Lagerbezug des Auftrags trägt nur die Auftrags-ID", () => {
  const p = mapOrderPrefillToShipment(AUFTRAG_PREFILL);
  assert.deepEqual(Object.keys(p.inventory).sort(), ["orderId", "orderNumber"]);
  assert.equal(p.inventory.orderId, "7");
  // Keine Mengen, keine Artikeldaten, keine Bestandswerte im Clientpayload:
  // die Positionen bestimmt der Server aus den offenen Reservierungen.
  assert.ok(!("items" in p.inventory));
  assert.ok(!("quantity" in p.inventory));
});

test("11 — ein kaputter Auftrags-Prefill ergibt null statt eines halben Formulars", () => {
  for (const schlecht of [null, undefined, {}, { order: { id: "1" } }, { recipient: null }, "text", []]) {
    assert.equal(mapOrderPrefillToShipment(schlecht), null, `${JSON.stringify(schlecht)} hätte null ergeben müssen`);
  }
});

/* ══════════ 4 — Prefill: Artikel ═════════════════════════════════════════ */

const ARTIKEL = { id: "11", sku: "A-1", name: "Artikel A", weightKg: 1.25 };

test("12 — der Artikel-Prefill rechnet das Warengewicht, aber lässt den Empfänger leer", () => {
  const p = mapProductToShipment(ARTIKEL, 5, "3");
  assert.equal(p.form.weight, "6.25");
  for (const k of Object.keys(p.form)) {
    assert.ok(!k.startsWith("r_"), "ein Artikel kennt keinen Empfänger");
  }
  assert.deepEqual(p.inventory, { warehouseId: "3", items: [{ productId: "11", quantity: 5, name: "Artikel A", sku: "A-1" }] });
});

test("13 — ein rechnerisch unzulässiges Gesamtgewicht wird NICHT gekappt, sondern weggelassen", () => {
  // 900 × 2 kg = 1800 kg liegt über der Versandgrenze von 1000 kg. Ein gekappter
  // Wert wäre eine stille Falschangabe — der Kunde soll entscheiden.
  const p = mapProductToShipment({ ...ARTIKEL, weightKg: 2 }, 900);
  assert.ok(!("weight" in p.form), "ein unzulässiges Gewicht darf nicht vorbelegt werden");
  assert.equal(p.inventory.items[0].quantity, 900);
});

test("14 — ungültige Mengen ergeben null (keine Sendung mit Menge 0 oder 1,5)", () => {
  for (const q of [0, -1, 1.5, "abc", null, undefined, NaN, Infinity, 1000001]) {
    assert.equal(mapProductToShipment(ARTIKEL, q), null, `Menge ${q} hätte abgelehnt werden müssen`);
  }
  assert.ok(mapProductToShipment(ARTIKEL, 1));
});

/* ══════════ 5 — Fehlertexte ══════════════════════════════════════════════ */

test("15 — bekannte Fehlercodes werden übersetzt, der Code erscheint nie im Text", () => {
  assert.match(inventoryErrorText({ code: "INSUFFICIENT_STOCK" }), /nicht genügend Bestand/i);
  assert.match(inventoryErrorText({ code: "ORDER_NOT_FOUND" }), /Auftrag/i);
  // Auftrags-Race (Finding 2): kein Bestandsfehler, kein Rassen-/Lock-Jargon.
  assert.match(inventoryErrorText({ code: "ORDER_RESERVATION_IN_USE" }), /Sendung gebucht/i);
  for (const code of ["INSUFFICIENT_STOCK", "PRODUCT_NOT_FOUND", "WAREHOUSE_NOT_FOUND", "ORDER_NOT_FOUND",
                      "INVALID_QUANTITY", "CONCURRENT_STOCK_CHANGE", "RESERVATION_NOT_FOUND", "ORDER_RESERVATION_IN_USE"]) {
    assert.ok(!inventoryErrorText({ code }).includes(code), `${code} steht im sichtbaren Text`);
  }
  // Unbekannter Code → Servertext, dann neutraler Satz. Nie der Code selbst.
  assert.equal(inventoryErrorText({ code: "WAS_AUCH_IMMER", error: "Serverbeschreibung" }), "Serverbeschreibung");
  assert.equal(inventoryErrorText({ code: "WAS_AUCH_IMMER" }, "Standard"), "Standard");
  assert.equal(inventoryErrorText(null, "Standard"), "Standard");
});

/* ══════════ 6 — Vorgangsschema: additiv und fail-closed ══════════════════ */

test("16 — der Lagerbezug ist additiv im Vorgangsschema und standardmäßig null", () => {
  const leer = emptyScope("shipment");
  assert.ok("inventoryContext" in leer, "inventoryContext fehlt im Schema");
  assert.equal(leer.inventoryContext, null);
  // Ein Vorgang aus der Zeit VOR dem Lagermodul kennt das Feld nicht — er darf
  // deshalb NICHT verworfen werden (kein Versionssprung).
  const alt = normalizeScope({ form: {}, shippingDate: null }, "shipment");
  assert.notEqual(alt, null, "ein alter Vorgang wurde grundlos verworfen");
  assert.equal(alt.inventoryContext, null);
});

test("17 — der Lagerbezug überlebt dropOffers (er gehört zum Formular, nicht zum Ergebnis)", () => {
  const scope = { ...emptyScope("shipment"), inventoryContext: { orderId: "7", orderNumber: "CE-AU26-00001" }, tariffs: [{ a: 1 }], shipmentId: "s_x" };
  const danach = dropOffers(scope);
  assert.deepEqual(danach.tariffs, [], "Angebote müssen verworfen werden");
  assert.equal(danach.shipmentId, null);
  assert.deepEqual(danach.inventoryContext, { orderId: "7", orderNumber: "CE-AU26-00001" },
    "der Lagerbezug darf bei einer erneuten Preisberechnung nicht verloren gehen");
});

test("18 — ein kaputter oder halber Lagerbezug wird VERWORFEN, nie teilweise übernommen", () => {
  for (const schlecht of [
    null, undefined, "", 0, [], "orderId",
    { orderId: "abc" }, { orderId: "0" }, { orderId: "-1" },
    { items: [] }, { items: [{ productId: "1" }] }, { items: [{ productId: "1", quantity: 0 }] },
    { items: [{ productId: "abc", quantity: 1 }] }, { items: [{ productId: "1", quantity: 1.5 }] },
    { warehouseId: "x", items: [{ productId: "1", quantity: 1 }] },
    { items: new Array(101).fill({ productId: "1", quantity: 1 }) },
  ]) {
    assert.equal(normalizeInventoryContext(schlecht), null, `${JSON.stringify(schlecht)} hätte verworfen werden müssen`);
  }
  assert.deepEqual(normalizeInventoryContext({ orderId: "7" }), { orderId: "7", orderNumber: null });
  // name/sku sind additiv und rein kosmetisch (Herkunftshinweis) — ohne sie: null.
  assert.deepEqual(normalizeInventoryContext({ warehouseId: "3", items: [{ productId: "11", quantity: 5 }] }),
    { warehouseId: "3", items: [{ productId: "11", quantity: 5, name: null, sku: null }] });
  assert.deepEqual(
    normalizeInventoryContext({ warehouseId: "3", items: [{ productId: "11", quantity: 5, name: "Tisch", sku: "ART-1" }] }),
    { warehouseId: "3", items: [{ productId: "11", quantity: 5, name: "Tisch", sku: "ART-1" }] });
});

test("18b — name/sku sind kosmetisch: kein Einfluss auf Gültigkeit, werden auf 200 Zeichen gekappt", () => {
  const lang = "X".repeat(500);
  const n = normalizeInventoryContext({ items: [{ productId: "1", quantity: 1, name: lang, sku: 123 }] });
  assert.equal(n.items[0].name.length, 200);
  assert.equal(n.items[0].sku, null, "ein Nicht-String wird verworfen, nicht in einen String gezwungen");
});

test("19 — eine einzige kaputte Position verwirft den GESAMTEN Lagerbezug", () => {
  const gemischt = { items: [{ productId: "1", quantity: 2 }, { productId: "2", quantity: -1 }] };
  assert.equal(normalizeInventoryContext(gemischt), null,
    "ein Teilkontext würde eine unvollständige Ausbuchung vorbereiten");
});

/* ══════════ 7 — Quelltext: keine zweite Versandlogik ═════════════════════ */

test("20 — der Lagerbereich ruft weder Preisberechnung noch Buchung selbst auf", () => {
  const dateien = [
    "../api/inventoryApi.js",
    "../pages/inventory/ProductsPage.jsx", "../pages/inventory/OrdersPage.jsx",
    "../pages/inventory/StockPage.jsx", "../pages/inventory/MovementsPage.jsx",
    "../pages/inventory/InventoryOverviewPage.jsx",
    "../pages/inventory/ProductDetailPage.jsx", "../pages/inventory/OrderDetailPage.jsx",
    "../components/inventory/InventoryShared.jsx", "../components/inventory/ProductForm.jsx",
    "../components/inventory/OrderCreateForm.jsx",
  ];
  const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const d of dateien) {
    // Nur CODE zählt — ein Kommentar, der den Versand erklärt, ist kein Eingriff.
    const src = ohneKommentare(lies(d));
    for (const verboten of ["calculate-price", "/api/jumingo/book", "/booking", "shipperTariffId", "tariffs"]) {
      assert.ok(!src.includes(verboten),
        `${d} greift in den Versandprozess ein („${verboten}") — der Lagerbereich darf nur prefillen`);
    }
  }
});

test("21 — es gibt keinen Client-Aufruf, der einen Bestand direkt setzt", () => {
  const api = lies("../api/inventoryApi.js");
  // Erlaubt sind ausschließlich Delta-Vorgänge MIT Bewegung.
  assert.ok(api.includes("postReceipt") && api.includes("postAdjustment"));
  for (const verboten of ["setStock", "putStock", "updateBalance", "setBalance", "overrideStock"]) {
    assert.ok(!api.includes(verboten), `${verboten} darf es nicht geben`);
  }
  // Und die Korrektur schickt den GEZÄHLTEN Wert, nicht ein clientseitig
  // errechnetes Delta.
  const stock = lies("../pages/inventory/StockPage.jsx");
  assert.ok(stock.includes("countedQuantity"), "die Korrektur muss den gezählten Bestand senden");
});

test("22 — RESTORE_PRIORITY bleibt unverändert (das Adressbuch-Prefill darf nicht leiden)", () => {
  const src = lies("./shippingFlowState.mjs");
  assert.match(src, /RESTORE_PRIORITY = Object\.freeze\(\["draft", "prefill", "flow", "profile", "empty"\]\)/,
    "die Wiederherstellungsreihenfolge wurde verändert");
});

test("23 — der Lager-Prefill nutzt denselben Einmal-Mechanismus wie das Adressbuch", () => {
  const src = lies("../pages/NewShipmentPage.jsx");
  // Beide Prefills melden sich nach der Anwendung selbst ab — sonst könnten alte
  // Artikel-/Auftragsdaten bei einer späteren normalen Sendung erneut greifen.
  assert.ok(src.includes("onPrefillApplied?.()"), "das Adressbuch-Prefill wurde beschädigt");
  assert.ok(src.includes("onInventoryPrefillApplied?.()"), "der Lager-Prefill meldet sich nicht ab");
  // Und der Lagerbezug wird bei jeder Preisanfrage nur MITGESCHICKT, wenn er
  // existiert — eine normale Sendung schickt das Feld gar nicht.
  assert.ok(src.includes("...(inventoryContext ? { inventory: inventoryContext } : {})"),
    "der Lagerbezug wird nicht bedingt mitgeschickt");
});
