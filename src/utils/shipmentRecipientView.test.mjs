// Empfänger einer Sendung in Listen (Audit B.4, Komplettabschluss 2026-10-28) — wer und wohin, nur aus vorhandenen
// Feldern. Sendungsliste und „Letzte Sendungen“ der Übersicht lesen dieselbe Abbildung.
//
// Run: node --test src/utils/shipmentRecipientView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { shipmentRecipient, shipmentRecipientLine } from "./shipmentRecipientView.mjs";

test("1 — Firma vor Ansprechpartner, „PLZ Ort“ und das Land als Kürzel", () => {
  const s = { recipient_address: { company: " Alpen Handel  GmbH ", fullName: "Anna Berger", postalCode: "1070", city: "Wien", country: "at" } };
  assert.deepEqual(shipmentRecipient(s), { name: "Alpen Handel GmbH", ort: "1070 Wien", land: "AT", wohin: "1070 Wien, AT" });
  assert.equal(shipmentRecipientLine(s), "Alpen Handel GmbH, 1070 Wien, AT");
  // Ohne Firma der Ansprechpartner; die Schreibweise camelCase gilt ebenso.
  const privat = { recipientAddress: { fullName: "Anna Berger", zip: "10115", city: "Berlin", country: "DE" } };
  assert.equal(shipmentRecipient(privat).name, "Anna Berger");
  assert.equal(shipmentRecipient(privat).wohin, "10115 Berlin, DE");
});

test("2 — nur vorhandene Teile; ohne Angabe null statt eines geratenen Werts", () => {
  // Land aus to_country, wenn die Adresse keins trägt.
  assert.deepEqual(shipmentRecipient({ recipient_address: { city: "Paris" }, to_country: "fr" }),
    { name: "", ort: "Paris", land: "FR", wohin: "Paris, FR" });
  assert.equal(shipmentRecipient({ recipient_address: { company: "Studio Verde" } }).wohin, "");
  // Eine ältere Sendung ohne Empfängerangabe: nichts erfinden.
  for (const leer of [null, undefined, {}, { recipient_address: null }, { recipient_address: "Wien" }, { to_country: "AT" }]) {
    assert.equal(shipmentRecipient(leer), null);
    assert.equal(shipmentRecipientLine(leer), "");
  }
});
