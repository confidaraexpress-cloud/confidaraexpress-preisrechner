// TG124: Abbildung der Portalshops auf die Trefferliste — nur, was die Quelle liefert.
import test from "node:test";
import assert from "node:assert/strict";
import { mapPortalShopsToList } from "./portalParcelShops.mjs";
import { accessPointMarkers, formatDistance } from "./accessPointView.mjs";
import { TG124_SHOPS_63808 } from "../../tests/fixtures/tg124ParcelShops63808.mjs";

test("die zehn Shops der Staging-Antwort 63808: Name, Anschrift, Entfernung in km, Kennungen", () => {
  const liste = mapPortalShopsToList(TG124_SHOPS_63808);
  assert.equal(liste.length, 10);
  assert.deepEqual(liste.map((s) => s.name).slice(0, 3), ["Lotto Shop Lange", "Myflexbox - DPD Pickup Paketstation", "Landhotel Klingerhof GmbH"]);
  assert.equal(liste[0].address, "Würzburger Str. 116, 63808 Haibach");
  assert.equal(liste[2].address, "Am Hügel 7, 63768 Hösbach");
  assert.deepEqual(liste.map((s) => formatDistance(s.distance, s.distanceCode)),
    ["0,2 km", "3,1 km", "3,3 km", "5,2 km", "5,8 km", "6,2 km", "6,3 km", "6,4 km", "6,9 km", "7,0 km"]);
  assert.deepEqual(liste[0].dropoffShop, { parcelShopId: "262668", pickupLocationCode: "DE19321", name: "Lotto Shop Lange",
    postcode: "63808", city: "Haibach", street: "Würzburger Str.", houseNumber: "116", town: "Haibach", countryCode: "DE" });
});

test("keine Platzhalter: kein Status, keine Öffnungszeiten, ohne Entfernung keine Angabe, ohne Position kein Marker", () => {
  const liste = mapPortalShopsToList([{ ...TG124_SHOPS_63808[0], distanceKm: null }, { ...TG124_SHOPS_63808[1], distanceKm: -1 }]);
  for (const s of liste) {
    assert.equal(s.status, null);
    assert.equal(s.hours, null);
    assert.equal(s.hoursOfOperation, null);
    assert.equal(s.distance, null);
    assert.equal(s.distanceCode, null);
  }
  assert.equal(accessPointMarkers(liste).length, 0);
});

test("vom Server geprüfte Positionen gehen durch (P3 vorbereitet), ungültige erzeugen keinen Marker", () => {
  const liste = mapPortalShopsToList([
    { ...TG124_SHOPS_63808[0], latitude: 49.9612, longitude: 9.2071, positionSource: "address" },
    { ...TG124_SHOPS_63808[1], latitude: 0, longitude: 0, positionSource: "address" },
    TG124_SHOPS_63808[2],
  ]);
  const marker = accessPointMarkers(liste);
  assert.equal(marker.length, 1);
  assert.equal(marker[0].accessPoint.name, "Lotto Shop Lange");
  assert.equal(liste[0].positionSource, "address");
});

test("ungültige Shops (ohne Kennung oder Pflichtangabe) fallen weg; Texte bleiben unverändert", () => {
  const liste = mapPortalShopsToList([{ ...TG124_SHOPS_63808[0], pickupLocationCode: "" }, { ...TG124_SHOPS_63808[1], city: null },
    { ...TG124_SHOPS_63808[2], name: "Kiosk &#252;" }, null, "kaputt"]);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].name, "Kiosk &#252;", "das Frontend dekodiert nie — das macht der Server");
  assert.deepEqual(mapPortalShopsToList(null), []);
});
