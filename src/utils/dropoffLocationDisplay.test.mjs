// Block C — der beim Buchen gebundene Abgabe-Paketshop in Erfolgsseite, Kundenkonto und Adminsicht.
// Eine Quelle: das Serverfeld (`dropoffLocation` der /book-Antwort, `dropoff_location` von Kundenliste und
// Admindetail). Nie die lokale Auswahl, nie eine Ableitung aus Tarif oder ServiceID.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boundDropoffLocationLine, DROPOFF_LOCATION_LABEL } from "./dropoffParcelShop.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Kommentarfrei gemessen — eine Begründung darf keine Zusage belegen (m-Flag wegen CRLF). Zeilenkommentare
// zuerst: einer, der „/*" nennt, eröffnete sonst einen Blockkommentar bis zum nächsten „*/" im JSX.
const code = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8")
  .replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ORT = { name: "Kiosk am Markt", street: "Bernhardstr. 19", postalCode: "63741", city: "Aschaffenburg", country: "DE" };
const ZEILE = "Kiosk am Markt, Bernhardstr. 19, 63741 Aschaffenburg";

test("Block C: die Zeile kommt aus dem Serverfeld — /book-Antwort und Liste/Admin gleich", () => {
  assert.equal(DROPOFF_LOCATION_LABEL, "Abgabe-Paketshop");
  assert.equal(boundDropoffLocationLine({ dropoffLocation: ORT }), ZEILE);
  assert.equal(boundDropoffLocationLine({ dropoff_location: ORT }), ZEILE);
  assert.equal(boundDropoffLocationLine({ dropoff_location: { ...ORT, street: null } }), "Kiosk am Markt, 63741 Aschaffenburg");
  assert.equal(boundDropoffLocationLine({ dropoff_location: { ...ORT, name: "  Kiosk am Markt " } }), ZEILE);
});

test("Block C: ohne Serverfeld oder ohne Name/PLZ/Ort keine Zeile — nichts geraten", () => {
  for (const r of [null, undefined, {}, { dropoff_location: null }, { dropoffLocation: "Kiosk" },
                   { dropoff_location: { ...ORT, name: "" } }, { dropoff_location: { ...ORT, postalCode: null } },
                   { dropoff_location: { ...ORT, city: " " } }]) {
    assert.equal(boundDropoffLocationLine(r), null, JSON.stringify(r));
  }
  // Die lokale Shopauswahl und die Tarifart sind keine Quelle.
  assert.equal(boundDropoffLocationLine({ dropoffParcelShop: { ...ORT, postcode: "63741" }, serviceType: "dropoff" }), null);
  assert.equal(boundDropoffLocationLine({ parcelShopSearch: "server", selectedDropoffShop: ORT }), null);
});

test("Block C: keine Plattformkennung in der Zeile", () => {
  const zeile = boundDropoffLocationLine({ dropoff_location: { ...ORT, parcelShopId: "539869", pickupLocationCode: "DE45621" } });
  assert.equal(zeile, ZEILE);
  assert.ok(!/539869|DE45621/.test(zeile));
});

test("Block C: Erfolgsseite, Kundenkonto und Adminsicht lesen denselben Helfer am SERVERdatensatz", () => {
  const erfolg = code("components/booking/BookingSuccessStep.jsx");
  assert.match(erfolg, /boundDropoffLocationLine\(booking\)/, "Erfolgsseite liest nicht die Buchungsantwort");
  assert.match(erfolg, /id="booking-success-dropoff-location"/);
  assert.ok(!/boundDropoffLocationLine\((tariff|selectedDropoffShop|bookingData)/.test(erfolg), "Erfolgsseite liest eine lokale Quelle");
  const konto = code("components/dashboard/ShipmentsList.jsx");
  assert.match(konto, /boundDropoffLocationLine\(s\)/, "Kundenkonto liest nicht die Sendungszeile");
  const admin = code("pages/admin/AdminShipmentDetailPage.jsx");
  assert.match(admin, /boundDropoffLocationLine\(s\)/, "Adminsicht liest nicht das Sendungsdetail");
  for (const [name, text] of [["Erfolgsseite", erfolg], ["Kundenkonto", konto], ["Adminsicht", admin]]) {
    assert.match(text, /DROPOFF_LOCATION_LABEL/, `${name}: eigene Beschriftung statt der gemeinsamen`);
    assert.ok(!/serviceId\s*===\s*124|provider_service_id|124\s*===/.test(text), `${name}: ServiceID-Weiche`);
  }
});
