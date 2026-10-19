/* Lager- und Auftragsfehler aus dem Paritätsaudit 2026-10-15 (Backend #432):
   ORDER_ALREADY_SHIPPED (BI1), PRODUCT_INACTIVE mit SKU (BI2), Zahlen aus `details`
   bei Sperre/Freigabe (BI4) und die Mehrlagerregeln (BI9). Ein Rohcode erscheint nie
   im sichtbaren Text; ohne verwertbare Angaben bleibt der Grundsatz. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryErrorText } from "./inventoryErrors.mjs";

const NEUE_CODES = ["ORDER_ALREADY_SHIPPED", "PRODUCT_INACTIVE", "WAREHOUSE_INACTIVE",
  "WAREHOUSE_DEFAULT_REQUIRED", "WAREHOUSE_NOT_EMPTY"];

test("1 — BI1: ein versendeter Auftrag ist NICHT „nicht gefunden“", () => {
  const t = inventoryErrorText({ code: "ORDER_ALREADY_SHIPPED", error: "Ein vollständig versendeter Auftrag kann nicht storniert werden" });
  assert.match(t, /bereits vollständig versendet/);
  assert.doesNotMatch(t, /nicht gefunden/);
});

test("2 — BI2: ein inaktiver Artikel wird mit seiner SKU benannt", () => {
  assert.equal(
    inventoryErrorText({ code: "PRODUCT_INACTIVE", details: { productId: "7", sku: "A-100" } }),
    "Der Artikel „A-100“ ist nicht mehr aktiv und kann nicht beauftragt werden. Bitte entfernen Sie ihn aus dem Auftrag.",
  );
  // Ohne SKU: der Grundsatz, nie „nicht gefunden“.
  assert.match(inventoryErrorText({ code: "PRODUCT_INACTIVE" }), /nicht mehr aktiv/);
  assert.match(inventoryErrorText({ code: "PRODUCT_INACTIVE", details: { sku: "   " } }), /nicht mehr aktiv/);
});

test("3 — BI4: Sperre und Freigabe nennen die Zahl des Servers", () => {
  assert.equal(
    inventoryErrorText({ code: "INSUFFICIENT_STOCK", details: { available: 3, requested: 5 } }),
    "Dafür ist nicht genügend Bestand verfügbar. Verfügbar sind nur 3 Einheiten.",
  );
  assert.equal(
    inventoryErrorText({ code: "INSUFFICIENT_STOCK", details: { available: 1, requested: 2 } }),
    "Dafür ist nicht genügend Bestand verfügbar. Verfügbar ist nur 1 Einheit.",
  );
  assert.equal(
    inventoryErrorText({ code: "INSUFFICIENT_BLOCKED_STOCK", details: { blocked: 2, requested: 4 } }),
    "Es ist weniger Bestand gesperrt, als Sie freigeben möchten. Gesperrt sind 2 Einheiten.",
  );
  // Keine verwertbare Zahl (Korrektur, Reservierung): unverändert der Grundsatz.
  assert.equal(inventoryErrorText({ code: "INSUFFICIENT_STOCK" }), "Dafür ist nicht genügend Bestand verfügbar.");
  assert.equal(inventoryErrorText({ code: "INSUFFICIENT_STOCK", details: { productId: "1", requested: 3 } }),
    "Dafür ist nicht genügend Bestand verfügbar.");
  assert.equal(inventoryErrorText({ code: "INSUFFICIENT_STOCK", details: { available: "drei" } }),
    "Dafür ist nicht genügend Bestand verfügbar.");
});

test("4 — BI9: die Mehrlagerregeln sind verständlich, ein volles Lager nennt seine Mengen", () => {
  assert.match(inventoryErrorText({ code: "WAREHOUSE_INACTIVE" }), /inaktiv/);
  assert.match(inventoryErrorText({ code: "WAREHOUSE_DEFAULT_REQUIRED" }), /zuerst ein anderes aktives Lager als Standard/);
  assert.equal(
    inventoryErrorText({ code: "WAREHOUSE_NOT_EMPTY", details: { onHand: 4, reserved: 2, blocked: 1, openReservations: 1, openOrders: 1 } }),
    "Das Lager kann erst deaktiviert werden, wenn es leer ist. Noch vorhanden: 4 Einheiten Bestand (davon 1 gesperrt, 2 reserviert), 1 offener Auftrag.",
  );
  assert.equal(
    inventoryErrorText({ code: "WAREHOUSE_NOT_EMPTY", details: { onHand: 1, reserved: 0, blocked: 0, openReservations: 0, openOrders: 0 } }),
    "Das Lager kann erst deaktiviert werden, wenn es leer ist. Noch vorhanden: 1 Einheit Bestand.",
  );
  assert.equal(inventoryErrorText({ code: "WAREHOUSE_NOT_EMPTY" }), "Das Lager kann erst deaktiviert werden, wenn es leer ist.");
});

test("5 — kein neuer Code erscheint roh, der Servertext wird bei bekanntem Code nicht durchgereicht", () => {
  for (const code of NEUE_CODES) {
    const t = inventoryErrorText({ code, error: "ROHTEXT des Servers", details: {} });
    assert.ok(!t.includes(code), `${code} steht im Text`);
    assert.ok(!t.includes("ROHTEXT"), `${code}: Servertext statt kuratiertem Text`);
  }
});

test("BI9 — offene Reservierungen erscheinen, wenn kein reservierter Bestand sie schon nennt", async () => {
  const { inventoryErrorText } = await import("./inventoryErrors.mjs");
  const nur = inventoryErrorText({ code: "WAREHOUSE_NOT_EMPTY", details: { onHand: 0, reserved: 0, blocked: 0, openReservations: 2, openOrders: 0 } });
  assert.match(nur, /Noch vorhanden: 2 offene Reservierungen\./);
  const beides = inventoryErrorText({ code: "WAREHOUSE_NOT_EMPTY", details: { onHand: 4, reserved: 2, blocked: 0, openReservations: 1, openOrders: 1 } });
  assert.match(beides, /4 Einheiten Bestand \(davon 2 reserviert\), 1 offener Auftrag\./);
  assert.doesNotMatch(beides, /offene Reservierung/);
});
