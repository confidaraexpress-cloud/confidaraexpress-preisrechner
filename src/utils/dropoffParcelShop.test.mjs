// Tests für die DPD-Paketshop-Abgabe-Logik (TG124) — reine .mjs-Logik, kein DOM.
// `supportsAccessPointSearch` ist der Befund aus carrierMap.offerSupportsAccessPointSearch (hereingereicht).
import test from "node:test";
import assert from "node:assert/strict";
import {
  offerRequiresDropoffParcelShop, normalizeDropoffParcelShop,
  dropoffShopBlocksBooking, dropoffParcelShopBookPayload,
} from "./dropoffParcelShop.mjs";

const dropoffBookbar = { bookable: true };            // auswählbar
const dropoffAdressartOffen = { bookable: false, unavailableReason: "price_inputs_required", requiredPriceInputs: ["deliveryIsResidential"] }; // auswählbar
const dropoffQuoteOnly = { bookable: false, unavailableReason: "quote_only" };                 // NICHT auswählbar
const abholung = { bookable: true };                  // supportsAccessPointSearch=false (Abholung)

const SHOP = { parcelShopId: "539869", pickupLocationCode: "DE45621", name: "Myflexbox - DPD Pickup Paketstation", street: "Bernhardstr.", houseNumber: "19", postcode: "63741", city: "Aschaffenburg", town: "Damm", countryCode: "DE" };

test("offerRequiresDropoffParcelShop: nur auswählbare + suchbare Shopabgabe-Angebote", () => {
  assert.strictEqual(offerRequiresDropoffParcelShop(dropoffBookbar, true), true);
  assert.strictEqual(offerRequiresDropoffParcelShop(dropoffAdressartOffen, true), true, "auch während der Adressartwahl");
  assert.strictEqual(offerRequiresDropoffParcelShop(dropoffQuoteOnly, true), false, "quote_only verlangt keinen Shop");
  assert.strictEqual(offerRequiresDropoffParcelShop(abholung, false), false, "Abholung (keine Shopsuche) verlangt keinen Shop");
  assert.strictEqual(offerRequiresDropoffParcelShop(dropoffBookbar, false), false, "ohne suchbare Shopabgabe kein Shopzwang");
  assert.strictEqual(offerRequiresDropoffParcelShop(null, true), false);
});

test("normalizeDropoffParcelShop: gültige Auswahl → normalisiert, sonst null", () => {
  assert.deepStrictEqual(normalizeDropoffParcelShop(SHOP), SHOP);
  assert.strictEqual(normalizeDropoffParcelShop({ id: "1", pudoId: "DE1", name: "X", postCode: "12345", city: "Y" }).pickupLocationCode, "DE1");
  assert.strictEqual(normalizeDropoffParcelShop({ parcelShopId: "1", name: "X", postcode: "12345", city: "Y" }), null, "ohne pickupLocationCode");
  assert.strictEqual(normalizeDropoffParcelShop(null), null);
  assert.strictEqual(normalizeDropoffParcelShop({}), null);
});

test("dropoffShopBlocksBooking: sperrt nur, wenn nötig UND kein gültiger Shop", () => {
  assert.strictEqual(dropoffShopBlocksBooking(dropoffBookbar, null, true), true, "Shopabgabe ohne Shop → gesperrt");
  assert.strictEqual(dropoffShopBlocksBooking(dropoffBookbar, SHOP, true), false, "mit Shop → frei");
  assert.strictEqual(dropoffShopBlocksBooking(dropoffBookbar, { parcelShopId: "x" }, true), true, "unvollständiger Shop → gesperrt");
  assert.strictEqual(dropoffShopBlocksBooking(abholung, null, false), false, "Abholung nie durch Shop gesperrt");
  assert.strictEqual(dropoffShopBlocksBooking(dropoffQuoteOnly, null, true), false, "quote_only nie durch Shop gesperrt");
});

test("dropoffParcelShopBookPayload: {dropoffParcelShop} nur bei Bedarf + gültiger Auswahl", () => {
  assert.deepStrictEqual(dropoffParcelShopBookPayload(dropoffBookbar, SHOP, true), { dropoffParcelShop: SHOP });
  assert.deepStrictEqual(dropoffParcelShopBookPayload(dropoffBookbar, null, true), {}, "kein Shop → nichts (Server sperrt fail-closed)");
  assert.deepStrictEqual(dropoffParcelShopBookPayload(abholung, SHOP, false), {}, "Abholung sendet nie einen Shop");
  assert.deepStrictEqual(dropoffParcelShopBookPayload(dropoffQuoteOnly, SHOP, true), {}, "quote_only sendet nie einen Shop");
});
