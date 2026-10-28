// Die langen Inhalte der Layoutprüfung (langeInhalte.mjs) bleiben, was sie prüfen sollen: fehlende und alte lange
// Vorgangsnummern, längster und unbekannter Status, fünfstellige Beträge, lange Namen — auf den echten Demo-Antworten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verlaengere, LANG } from "./langeInhalte.mjs";
import { demoAntwort, demoZuruecksetzen } from "../../../src/demo/demoBackend.mjs";

async function antwort(pfad) {
  demoZuruecksetzen();
  const res = await demoAntwort(pfad);
  return verlaengere(pfad, await res.json());
}

test("1 — Sendungen: ohne Nummer, altes langes Format, längster und unbekannter Status, große Beträge", async () => {
  const { shipments } = await antwort("/kunde/shipments");
  assert.ok(shipments.length >= 4);
  assert.deepEqual(shipments.slice(0, 3).map((s) => s.order_confirmation_number), [null, "CE-AB-2026-000050", "CE-AB26-00001"]);
  assert.equal(shipments[0].status, "booking");
  assert.equal(shipments[3].status, "zollpruefung_ausstehend");
  assert.equal(shipments[0].price_final, 12345.67);
  assert.equal(shipments[0].recipient_address.company, LANG.firma);
  assert.equal(shipments[0].recipient_address.city, LANG.ort);
  assert.equal(shipments[0].tracking_number, LANG.tracking);
});

test("2 — Konto, Rechnungen, Lager und Support tragen die langen Werte", async () => {
  const { user } = await antwort("/kundenbereich");
  assert.equal(user.company_name, LANG.firma);
  assert.equal(user.email, LANG.email);
  const { invoices } = await antwort("/kunde/invoices");
  assert.ok(invoices.every((r) => /^CE-RE-2026-\d{6}$/.test(r.invoice_number)));
  const { products } = await antwort("/api/kunde/products");
  assert.ok(products.every((p) => p.sku === LANG.sku && p.name === LANG.produkt));
  const { orders } = await antwort("/api/kunde/orders");
  assert.ok(orders.every((o) => o.orderNumber === LANG.auftrag));
  const support = await antwort("/kunde/support-requests");
  assert.ok(support.items.every((t) => t.subject === LANG.betreff && t.ticketNumber === LANG.ticket));
});

test("3 — rein und deterministisch: gleiche Antwort, gleiches Ergebnis; die Eingabe bleibt unverändert", async () => {
  demoZuruecksetzen();
  const roh = await (await demoAntwort("/kunde/shipments")).json();
  const kopie = structuredClone(roh);
  assert.deepEqual(verlaengere("/kunde/shipments", roh), verlaengere("/kunde/shipments", roh));
  assert.deepEqual(roh, kopie);
});
