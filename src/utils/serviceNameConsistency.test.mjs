// Block D — ein Leistungsname: Kundenkonto und Adminsicht lesen denselben eingefrorenen Namen
// (`applied_tariff_display_name`, derselbe Wert wie Auftragsbestätigung und Rechnung) mit derselben
// Beschriftung. Nie die Preisklasse als Name, nie ein zweiter Helfer.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shipmentServiceNameOf, SHIPMENT_SERVICE_LABEL } from "./shipmentServiceNameView.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Zeilenkommentare zuerst (einer, der „/*" nennt, eröffnete sonst einen Blockkommentar); m-Flag wegen CRLF.
const code = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8")
  .replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("Block D: der Leistungsname kommt aus der eingefrorenen Sendungsspalte", () => {
  assert.equal(SHIPMENT_SERVICE_LABEL, "Service");
  assert.equal(shipmentServiceNameOf({ applied_tariff_display_name: "Economy Select", applied_service_class: "standard" }),
    "Economy Select");
  // Die Preisklasse ist keine Quelle.
  assert.equal(shipmentServiceNameOf({ applied_service_class: "standard" }), null);
});

test("Block D: Kundenkonto und Adminsicht lesen denselben Helfer mit derselben Beschriftung", () => {
  const konto = code("components/dashboard/ShipmentsList.jsx");
  const admin = code("pages/admin/AdminShipmentDetailPage.jsx");
  for (const [name, text] of [["Kundenkonto", konto], ["Adminsicht", admin]]) {
    assert.match(text, /shipmentServiceNameOf\(s\)/, `${name}: liest den Leistungsnamen nicht`);
    assert.match(text, /SHIPMENT_SERVICE_LABEL/, `${name}: eigene Beschriftung`);
    assert.ok(!/applied_service_class/.test(text), `${name}: die Preisklasse als Name`);
  }
});
